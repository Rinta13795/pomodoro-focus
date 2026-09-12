package com.mbti.course.servlet;

import com.mbti.course.bean.Comment;
import com.mbti.course.bean.PageResult;
import com.mbti.course.bean.Post;
import com.mbti.course.bean.User;
import com.mbti.course.dao.PostDao;
import com.mbti.course.util.SessionUtil;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;

@WebServlet({"/forum", "/post", "/post/detail", "/post/comment"})
public class PostServlet extends BaseServlet {

    private final PostDao postDao = new PostDao();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        try {
            String uri = req.getRequestURI();
            if (uri.endsWith("/forum")) {
                int page = parseInt(req.getParameter("page"), 1);
                int size = parseInt(req.getParameter("size"), 10);
                PageResult<Post> result = postDao.page(page, size);
                req.setAttribute("pageResult", result);
                req.getRequestDispatcher("/WEB-INF/jsp/forum.jsp").forward(req, resp);
            } else if (uri.endsWith("/post/detail")) {
                Long id = Long.valueOf(req.getParameter("id"));
                Post post = postDao.findById(id);
                if (post != null) {
                    postDao.increaseView(id, (post.getViewCount() == null ? 0 : post.getViewCount()) + 1);
                    post = postDao.findById(id);
                    req.setAttribute("post", post);
                    req.setAttribute("comments", postDao.comments(id));
                }
                req.getRequestDispatcher("/WEB-INF/jsp/post-detail.jsp").forward(req, resp);
            } else if (uri.endsWith("/post")) {
                req.getRequestDispatcher("/WEB-INF/jsp/post-form.jsp").forward(req, resp);
            }
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        req.setCharacterEncoding("UTF-8");
        try {
            String uri = req.getRequestURI();
            if (uri.endsWith("/post")) {
                publish(req, resp);
            } else if (uri.endsWith("/post/comment")) {
                comment(req, resp);
            }
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    private void publish(HttpServletRequest req, HttpServletResponse resp) throws SQLException, IOException, ServletException {
        User user = SessionUtil.currentUser(req);
        if (user == null) {
            resp.sendRedirect(req.getContextPath() + "/login");
            return;
        }
        Post post = new Post();
        post.setUserId(user.getId());
        post.setTitle(req.getParameter("title"));
        post.setContent(req.getParameter("content"));
        post.setViewCount(0);
        post.setCommentCount(0);
        post.setStatus(0);
        postDao.insert(post);
        resp.sendRedirect(req.getContextPath() + "/forum");
    }

    private void comment(HttpServletRequest req, HttpServletResponse resp) throws SQLException, IOException {
        User user = SessionUtil.currentUser(req);
        Long postId = Long.valueOf(req.getParameter("postId"));
        String content = req.getParameter("content");
        if (user != null && content != null && !content.isBlank()) {
            Comment c = new Comment();
            c.setPostId(postId);
            c.setUserId(user.getId());
            c.setContent(content);
            postDao.insertComment(c);
            Post post = postDao.findById(postId);
            postDao.increaseComment(postId, (post.getCommentCount() == null ? 0 : post.getCommentCount()) + 1);
        }
        resp.sendRedirect(req.getContextPath() + "/post/detail?id=" + postId);
    }

    private int parseInt(String value, int defaultValue) {
        try {
            return value == null ? defaultValue : Integer.parseInt(value);
        } catch (Exception e) {
            return defaultValue;
        }
    }
}
