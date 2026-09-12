package com.mbti.course.servlet;

import com.mbti.course.bean.Post;
import com.mbti.course.bean.RecommendUser;
import com.mbti.course.bean.User;
import com.mbti.course.dao.PostDao;
import com.mbti.course.dao.UserDao;
import com.mbti.course.util.SessionUtil;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

@WebServlet("/recommend")
public class RecommendServlet extends BaseServlet {

    private final UserDao userDao = new UserDao();
    private final PostDao postDao = new PostDao();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        try {
            User me = SessionUtil.currentUser(req);
            List<User> users = userDao.findAll(10, 0);
            List<RecommendUser> recs = new ArrayList<>();
            for (User u : users) {
                if (me != null && me.getId().equals(u.getId())) continue;
                RecommendUser r = new RecommendUser();
                r.setUserId(u.getId());
                r.setNickname(u.getNickname());
                r.setMbtiType(u.getMbtiType());
                r.setAvatar(u.getAvatar());
                r.setCfSimilarity(0.5);
                r.setMbtiCompat(score(me == null ? null : me.getMbtiType(), u.getMbtiType()));
                r.setScore((r.getCfSimilarity() + r.getMbtiCompat()) / 2);
                r.setReason("MBTI 相容度较高，适合进一步了解");
                recs.add(r);
            }
            req.setAttribute("users", recs);
            List<Post> posts = postDao.listTop(6);
            req.setAttribute("posts", posts);
            req.getRequestDispatcher("/WEB-INF/jsp/recommend.jsp").forward(req, resp);
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    private double score(String a, String b) {
        if (a == null || b == null || a.length() != 4 || b.length() != 4) return 0.5;
        double s = 0;
        s += a.charAt(0) != b.charAt(0) ? 0.25 : 0.15;
        s += a.charAt(1) == b.charAt(1) ? 0.25 : 0.10;
        s += a.charAt(2) != b.charAt(2) ? 0.22 : 0.16;
        s += a.charAt(3) != b.charAt(3) ? 0.25 : 0.12;
        return Math.min(1.0, s / 0.97);
    }
}
