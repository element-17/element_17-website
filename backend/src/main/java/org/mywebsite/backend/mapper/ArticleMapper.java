package org.mywebsite.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.mywebsite.backend.model.entity.Article;
import org.mywebsite.backend.model.vo.TagCountVO;

import java.time.LocalDateTime;
import java.util.List;

public interface ArticleMapper {

    List<Article> selectPage(
            @Param("status") String status,
            @Param("tag") String tag,
            @Param("keyword") String keyword,
            @Param("offset") int offset,
            @Param("size") int size
    );

    long countPage(
            @Param("status") String status,
            @Param("tag") String tag,
            @Param("keyword") String keyword
    );

    Article findById(@Param("id") Long id);

    Article findBySlug(@Param("slug") String slug);

    Article findPublishedBySlug(@Param("slug") String slug);

    List<TagCountVO> countPublishedByTag();

    int insert(Article article);

    int update(Article article);

    int updateStatus(
            @Param("id") Long id,
            @Param("status") String status,
            @Param("pinned") Boolean pinned,
            @Param("publishedAt") LocalDateTime publishedAt
    );

    int incrementViewCountBySlug(@Param("slug") String slug, @Param("delta") long delta);

    int deleteById(@Param("id") Long id);
}
