package org.mywebsite.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.mywebsite.backend.common.api.ErrorCode;
import org.mywebsite.backend.common.api.PageResult;
import org.mywebsite.backend.common.exception.BizException;
import org.mywebsite.backend.mapper.ArticleMapper;
import org.mywebsite.backend.model.dto.ArticleSaveRequest;
import org.mywebsite.backend.model.dto.ArticleStatusRequest;
import org.mywebsite.backend.model.entity.Article;
import org.mywebsite.backend.model.vo.ArticleDetailVO;
import org.mywebsite.backend.model.vo.ArticleSummaryVO;
import org.mywebsite.backend.model.vo.TagCountVO;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class ArticleService {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_PUBLISHED = "PUBLISHED";

    private final ArticleMapper articleMapper;
    private final RedisCacheService cacheService;

    public ArticleService(ArticleMapper articleMapper, RedisCacheService cacheService) {
        this.articleMapper = articleMapper;
        this.cacheService = cacheService;
    }

    // ---------- 公开接口 ----------

    public PageResult<ArticleSummaryVO> listPublic(int page, int size, String tag, String keyword) {
        return queryPage(STATUS_PUBLISHED, page, size, tag, keyword);
    }

    public List<TagCountVO> listPublicTags() {
        return cacheService.get(RedisCacheService.KEY_ARTICLE_TAGS, new TypeReference<List<TagCountVO>>() {
        }).orElseGet(() -> {
            List<TagCountVO> tags = articleMapper.countPublishedByTag();
            cacheService.set(RedisCacheService.KEY_ARTICLE_TAGS, tags);
            return tags;
        });
    }

    public ArticleDetailVO getPublicDetail(String slug, String clientIp) {
        String cacheKey = RedisCacheService.articleDetailKey(slug);
        var lookup = cacheService.get(cacheKey, ArticleDetailVO.class);

        ArticleDetailVO detail;
        if (lookup.hit()) {
            if (lookup.value() == null) {
                throw new BizException(ErrorCode.NOT_FOUND, "文章不存在或尚未发布");
            }
            detail = lookup.value();
        } else {
            Article entity = articleMapper.findPublishedBySlug(slug);
            if (entity == null) {
                cacheService.setNull(cacheKey);
                throw new BizException(ErrorCode.NOT_FOUND, "文章不存在或尚未发布");
            }
            detail = toDetailVO(entity);
            cacheService.set(cacheKey, detail);
        }

        // 记录有效阅读量并把 Redis 尚未落库的增量叠加到返回值中
        long delta = cacheService.recordArticleView(slug, clientIp);
        ArticleDetailVO out = copyDetail(detail);
        out.setViewCount((detail.getViewCount() == null ? 0L : detail.getViewCount()) + delta);
        return out;
    }

    // ---------- 管理端接口 ----------

    public PageResult<ArticleSummaryVO> listAdmin(int page, int size, String status, String tag, String keyword) {
        return queryPage(status, page, size, tag, keyword);
    }

    public ArticleDetailVO getAdminDetail(Long id) {
        Article entity = requireById(id);
        ArticleDetailVO vo = toDetailVO(entity);
        long delta = cacheService.getArticleViewDelta(entity.getSlug());
        vo.setViewCount((vo.getViewCount() == null ? 0L : vo.getViewCount()) + delta);
        return vo;
    }

    @Transactional
    public ArticleDetailVO create(ArticleSaveRequest req) {
        String slug = req.getSlug().trim();
        if (articleMapper.findBySlug(slug) != null) {
            throw new BizException(ErrorCode.CONFLICT, "文章 slug 已存在：" + slug);
        }
        Article entity = new Article();
        applyFields(entity, req);
        entity.setViewCount(0L);
        if (STATUS_PUBLISHED.equals(entity.getStatus())) {
            entity.setPublishedAt(LocalDateTime.now());
        }
        articleMapper.insert(entity);
        evictArticleCaches(slug, null);
        return toDetailVO(articleMapper.findById(entity.getId()));
    }

    @Transactional
    public ArticleDetailVO update(Long id, ArticleSaveRequest req) {
        Article existing = requireById(id);
        String oldSlug = existing.getSlug();
        String newSlug = req.getSlug().trim();

        if (!oldSlug.equals(newSlug)) {
            Article conflict = articleMapper.findBySlug(newSlug);
            if (conflict != null && !conflict.getId().equals(id)) {
                throw new BizException(ErrorCode.CONFLICT, "文章 slug 已被其他文章占用：" + newSlug);
            }
        }

        applyFields(existing, req);
        if (STATUS_PUBLISHED.equals(existing.getStatus()) && existing.getPublishedAt() == null) {
            existing.setPublishedAt(LocalDateTime.now());
        }
        articleMapper.update(existing);
        evictArticleCaches(oldSlug, newSlug);
        return getAdminDetail(id);
    }

    @Transactional
    public ArticleDetailVO updateStatus(Long id, ArticleStatusRequest req) {
        Article existing = requireById(id);
        if ((req.getStatus() == null || req.getStatus().isBlank()) && req.getPinned() == null) {
            throw new BizException(ErrorCode.BAD_REQUEST, "status 与 pinned 至少提供一项");
        }
        LocalDateTime publishedAt = null;
        if (STATUS_PUBLISHED.equals(req.getStatus()) && existing.getPublishedAt() == null) {
            publishedAt = LocalDateTime.now();
        }
        articleMapper.updateStatus(id, req.getStatus(), req.getPinned(), publishedAt);
        evictArticleCaches(existing.getSlug(), null);
        return getAdminDetail(id);
    }

    @Transactional
    public void delete(Long id) {
        Article existing = requireById(id);
        articleMapper.deleteById(id);
        cacheService.removeArticleViewDelta(existing.getSlug());
        evictArticleCaches(existing.getSlug(), null);
    }

    /** 每 5 分钟将 Redis 中缓冲的阅读量增量批量回写 MySQL */
    @Scheduled(fixedDelayString = "${app.cache.view-flush-ms:300000}")
    public void flushViewCountsToDb() {
        Map<String, Long> deltas = cacheService.getAllArticleViewDeltas();
        if (deltas.isEmpty()) {
            return;
        }
        int flushedArticles = 0;
        for (Map.Entry<String, Long> e : deltas.entrySet()) {
            String slug = e.getKey();
            long delta = e.getValue();
            if (delta <= 0) {
                continue;
            }
            try {
                int updated = articleMapper.incrementViewCountBySlug(slug, delta);
                if (updated > 0) {
                    cacheService.deductArticleViewDelta(slug, delta);
                    cacheService.delete(RedisCacheService.articleDetailKey(slug));
                    flushedArticles++;
                } else {
                    cacheService.removeArticleViewDelta(slug);
                }
            } catch (Exception ex) {
                log.warn("回写文章阅读量失败 slug={}, delta={}: {}", slug, delta, ex.getMessage());
            }
        }
        if (flushedArticles > 0) {
            log.info("已批量回写 {} 篇文章的 Redis 阅读量增量到 MySQL", flushedArticles);
        }
    }

    private PageResult<ArticleSummaryVO> queryPage(String status, int page, int size, String tag, String keyword) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 50);
        int offset = (safePage - 1) * safeSize;
        String cleanTag = blankToNull(tag);
        String cleanKeyword = blankToNull(keyword);
        String cleanStatus = blankToNull(status);

        long total = articleMapper.countPage(cleanStatus, cleanTag, cleanKeyword);
        if (total == 0) {
            return PageResult.of(List.of(), 0, safePage, safeSize);
        }
        Map<String, Long> viewDeltas = cacheService.getAllArticleViewDeltas();
        List<ArticleSummaryVO> records = articleMapper.selectPage(cleanStatus, cleanTag, cleanKeyword, offset, safeSize)
                .stream()
                .map(a -> toSummaryVO(a, viewDeltas.getOrDefault(a.getSlug(), 0L)))
                .toList();
        return PageResult.of(records, total, safePage, safeSize);
    }

    private Article requireById(Long id) {
        Article entity = articleMapper.findById(id);
        if (entity == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "文章不存在");
        }
        return entity;
    }

    private void applyFields(Article entity, ArticleSaveRequest req) {
        entity.setSlug(req.getSlug().trim());
        entity.setTitle(req.getTitle().trim());
        entity.setTag(req.getTag().trim());
        entity.setSummary(req.getSummary().trim());
        entity.setContent(req.getContent());
        entity.setExternalUrl(blankToNull(req.getExternalUrl()));
        entity.setStatus(req.getStatus() == null ? STATUS_DRAFT : req.getStatus());
        entity.setPinned(req.getPinned() != null && req.getPinned());
    }

    private void evictArticleCaches(String slug1, String slug2) {
        cacheService.delete(
                RedisCacheService.KEY_ARTICLE_TAGS,
                slug1 == null ? null : RedisCacheService.articleDetailKey(slug1),
                slug2 == null ? null : RedisCacheService.articleDetailKey(slug2)
        );
    }

    private static ArticleSummaryVO toSummaryVO(Article a, long delta) {
        ArticleSummaryVO vo = new ArticleSummaryVO();
        vo.setId(a.getId());
        vo.setSlug(a.getSlug());
        vo.setTitle(a.getTitle());
        vo.setTag(a.getTag());
        vo.setSummary(a.getSummary());
        vo.setStatus(a.getStatus());
        vo.setPinned(Boolean.TRUE.equals(a.getPinned()));
        vo.setViewCount((a.getViewCount() == null ? 0L : a.getViewCount()) + delta);
        vo.setPublishedAt(a.getPublishedAt());
        vo.setUpdatedAt(a.getUpdatedAt());
        return vo;
    }

    private static ArticleDetailVO toDetailVO(Article a) {
        ArticleDetailVO vo = new ArticleDetailVO();
        vo.setId(a.getId());
        vo.setSlug(a.getSlug());
        vo.setTitle(a.getTitle());
        vo.setTag(a.getTag());
        vo.setSummary(a.getSummary());
        vo.setContent(a.getContent());
        vo.setExternalUrl(a.getExternalUrl());
        vo.setStatus(a.getStatus());
        vo.setPinned(Boolean.TRUE.equals(a.getPinned()));
        vo.setViewCount(a.getViewCount() == null ? 0L : a.getViewCount());
        vo.setPublishedAt(a.getPublishedAt());
        vo.setUpdatedAt(a.getUpdatedAt());
        return vo;
    }

    private static ArticleDetailVO copyDetail(ArticleDetailVO src) {
        ArticleDetailVO c = new ArticleDetailVO();
        c.setId(src.getId());
        c.setSlug(src.getSlug());
        c.setTitle(src.getTitle());
        c.setTag(src.getTag());
        c.setSummary(src.getSummary());
        c.setContent(src.getContent());
        c.setExternalUrl(src.getExternalUrl());
        c.setStatus(src.getStatus());
        c.setPinned(src.getPinned());
        c.setViewCount(src.getViewCount());
        c.setPublishedAt(src.getPublishedAt());
        c.setUpdatedAt(src.getUpdatedAt());
        return c;
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
