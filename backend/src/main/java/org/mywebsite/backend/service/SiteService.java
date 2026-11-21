package org.mywebsite.backend.service;

import org.mywebsite.backend.mapper.ProfileItemMapper;
import org.mywebsite.backend.mapper.SiteConfigMapper;
import org.mywebsite.backend.mapper.SkillTagMapper;
import org.mywebsite.backend.model.dto.SiteUpdateRequest;
import org.mywebsite.backend.model.entity.ProfileItem;
import org.mywebsite.backend.model.entity.SiteConfig;
import org.mywebsite.backend.model.entity.SkillTag;
import org.mywebsite.backend.model.vo.AdminSiteVO;
import org.mywebsite.backend.model.vo.SiteOverviewVO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SiteService {

    private final SiteConfigMapper configMapper;
    private final ProfileItemMapper profileItemMapper;
    private final SkillTagMapper skillTagMapper;
    private final RedisCacheService cacheService;

    public SiteService(
            SiteConfigMapper configMapper,
            ProfileItemMapper profileItemMapper,
            SkillTagMapper skillTagMapper,
            RedisCacheService cacheService
    ) {
        this.configMapper = configMapper;
        this.profileItemMapper = profileItemMapper;
        this.skillTagMapper = skillTagMapper;
        this.cacheService = cacheService;
    }

    public SiteOverviewVO getPublicOverview() {
        var cached = cacheService.get(RedisCacheService.KEY_SITE_OVERVIEW, SiteOverviewVO.class);
        if (cached.hit() && cached.value() != null) {
            return cached.value();
        }

        Map<String, String> cfg = loadConfigMap();
        SiteOverviewVO.SiteMeta site = new SiteOverviewVO.SiteMeta(
                cfg.getOrDefault("site.name", "孤剑夜行"),
                cfg.getOrDefault("site.nameEn", "LONE BLADE"),
                cfg.getOrDefault("site.subtitle", "A Developer's World"),
                cfg.getOrDefault("site.tagline", "十年磨一剑，霜刃未曾试。")
        );

        Map<String, String> descriptions = new LinkedHashMap<>();
        descriptions.put("blog", cfg.getOrDefault("blog.desc", ""));
        descriptions.put("projects", cfg.getOrDefault("projects.desc", ""));
        descriptions.put("about", cfg.getOrDefault("about.desc", ""));
        descriptions.put("contact", cfg.getOrDefault("contact.desc", ""));

        List<SiteOverviewVO.ProfileItemVO> aboutItems = new ArrayList<>();
        List<SiteOverviewVO.ProfileItemVO> contactItems = new ArrayList<>();
        for (ProfileItem item : profileItemMapper.findVisible()) {
            var vo = new SiteOverviewVO.ProfileItemVO(
                    item.getId(), item.getLabel(), item.getMeta(), item.getCopyValue(), item.getHref());
            if ("about".equals(item.getSection())) {
                aboutItems.add(vo);
            } else if ("contact".equals(item.getSection())) {
                contactItems.add(vo);
            }
        }

        List<String> skills = skillTagMapper.findAllOrdered().stream()
                .map(SkillTag::getName)
                .toList();

        SiteOverviewVO overview = new SiteOverviewVO(site, descriptions, aboutItems, contactItems, skills);
        cacheService.set(RedisCacheService.KEY_SITE_OVERVIEW, overview);
        return overview;
    }

    public AdminSiteVO getAdminSite() {
        List<String> skills = skillTagMapper.findAllOrdered().stream()
                .map(SkillTag::getName)
                .toList();
        return new AdminSiteVO(loadConfigMap(), profileItemMapper.findAll(), skills);
    }

    @Transactional
    public AdminSiteVO updateSite(SiteUpdateRequest req) {
        if (req.getConfigs() != null) {
            for (Map.Entry<String, String> e : req.getConfigs().entrySet()) {
                if (e.getKey() == null || e.getKey().isBlank() || e.getValue() == null) {
                    continue;
                }
                int updated = configMapper.updateValue(e.getKey().trim(), e.getValue());
                if (updated == 0) {
                    configMapper.insert(new SiteConfig(e.getKey().trim(), e.getValue(), null, null));
                }
            }
        }

        if (req.getProfileItems() != null) {
            profileItemMapper.deleteAll();
            if (!req.getProfileItems().isEmpty()) {
                List<ProfileItem> rows = new ArrayList<>(req.getProfileItems().size());
                int idx = 1;
                for (SiteUpdateRequest.ProfileItemInput in : req.getProfileItems()) {
                    ProfileItem row = new ProfileItem();
                    row.setSection(in.getSection());
                    row.setLabel(in.getLabel().trim());
                    row.setMeta(in.getMeta().trim());
                    row.setCopyValue(blankToNull(in.getCopyValue()));
                    row.setHref(blankToNull(in.getHref()));
                    row.setSortOrder(in.getSortOrder() == null ? idx : in.getSortOrder());
                    row.setVisible(in.getVisible() == null ? Boolean.TRUE : in.getVisible());
                    rows.add(row);
                    idx++;
                }
                profileItemMapper.insertBatch(rows);
            }
        }

        cacheService.delete(RedisCacheService.KEY_SITE_OVERVIEW);
        return getAdminSite();
    }

    private Map<String, String> loadConfigMap() {
        Map<String, String> map = new LinkedHashMap<>();
        for (SiteConfig c : configMapper.findAll()) {
            map.put(c.getConfigKey(), c.getConfigValue());
        }
        return map;
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
