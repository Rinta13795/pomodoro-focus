package com.mbti.course.dao;

import com.mbti.course.bean.Comment;
import com.mbti.course.bean.PageResult;
import com.mbti.course.bean.Post;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;

public class PostDao extends BaseDao {

    private Post mapPost(ResultSet rs) throws SQLException {
        Post p = new Post();
        p.setId(rs.getLong("id"));
        p.setUserId(rs.getLong("user_id"));
        p.setTitle(rs.getString("title"));
        p.setContent(rs.getString("content"));
        p.setViewCount(rs.getInt("view_count"));
        p.setCommentCount(rs.getInt("comment_count"));
        p.setStatus(rs.getInt("status"));
        Object ct = rs.getObject("create_time");
        if (ct instanceof LocalDateTime ldt) {
            p.setCreateTime(ldt);
        }
        return p;
    }

    private Comment mapComment(ResultSet rs) throws SQLException {
        Comment c = new Comment();
        c.setId(rs.getLong("id"));
        c.setPostId(rs.getLong("post_id"));
        c.setUserId(rs.getLong("user_id"));
        c.setContent(rs.getString("content"));
        Object ct = rs.getObject("create_time");
        if (ct instanceof LocalDateTime ldt) {
            c.setCreateTime(ldt);
        }
        return c;
    }

    public PageResult<Post> page(int page, int size) throws SQLException {
        long total = queryLong("select count(*) from post where deleted = 0 and status = 0");
        int offset = (page - 1) * size;
        List<Post> list = queryList("select * from post where deleted = 0 and status = 0 order by create_time desc limit ? offset ?",
                this::mapPost, size, offset);
        return new PageResult<>(list, total, page, size);
    }

    public Post findById(Long id) throws SQLException {
        return queryOne("select * from post where id = ? and deleted = 0", this::mapPost, id);
    }

    public List<Post> listTop(int limit) throws SQLException {
        return queryList("select * from post where deleted = 0 and status = 0 order by view_count desc limit ?",
                this::mapPost, limit);
    }

    public int insert(Post post) throws SQLException {
        return update("insert into post(user_id,title,content,view_count,comment_count,status) values(?,?,?,?,?,?)",
                post.getUserId(), post.getTitle(), post.getContent(), post.getViewCount(), post.getCommentCount(), post.getStatus());
    }

    public int increaseView(Long id, int viewCount) throws SQLException {
        return update("update post set view_count=? where id=?", viewCount, id);
    }

    public int increaseComment(Long id, int commentCount) throws SQLException {
        return update("update post set comment_count=? where id=?", commentCount, id);
    }

    public int delete(Long id) throws SQLException {
        return update("update post set deleted = 1 where id = ?", id);
    }

    public int insertComment(Comment comment) throws SQLException {
        return update("insert into comment(post_id,user_id,content) values(?,?,?)",
                comment.getPostId(), comment.getUserId(), comment.getContent());
    }

    public List<Comment> comments(Long postId) throws SQLException {
        return queryList("select * from comment where post_id = ? and deleted = 0 order by create_time asc",
                this::mapComment, postId);
    }
}
