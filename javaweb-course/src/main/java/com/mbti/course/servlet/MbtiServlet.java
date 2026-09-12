package com.mbti.course.servlet;

import com.mbti.course.bean.MbtiQuestion;
import com.mbti.course.bean.MbtiResult;
import com.mbti.course.bean.User;
import com.mbti.course.dao.MbtiDao;
import com.mbti.course.dao.UserDao;
import com.mbti.course.util.SessionUtil;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@WebServlet({"/mbti/test", "/mbti/submit", "/mbti/result", "/mbti/history"})
public class MbtiServlet extends BaseServlet {

    private static final int NORMAL_DAILY_LIMIT = 1;
    private final MbtiDao mbtiDao = new MbtiDao();
    private final UserDao userDao = new UserDao();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        try {
            String uri = req.getRequestURI();
            if (uri.endsWith("/test")) {
                req.setAttribute("questions", mbtiDao.listQuestions());
                req.getRequestDispatcher("/WEB-INF/jsp/mbti-test.jsp").forward(req, resp);
            } else if (uri.endsWith("/result")) {
                req.getRequestDispatcher("/WEB-INF/jsp/mbti-result.jsp").forward(req, resp);
            } else if (uri.endsWith("/history")) {
                User user = SessionUtil.currentUser(req);
                req.setAttribute("history", mbtiDao.history(user.getId()));
                req.getRequestDispatcher("/WEB-INF/jsp/mbti-history.jsp").forward(req, resp);
            }
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        req.setCharacterEncoding("UTF-8");
        try {
            submit(req, resp);
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    private void submit(HttpServletRequest req, HttpServletResponse resp) throws SQLException, IOException, ServletException {
        User user = SessionUtil.currentUser(req);
        if (user == null) {
            resp.sendRedirect(req.getContextPath() + "/login");
            return;
        }
        if ("USER".equals(user.getRole()) && mbtiDao.countToday(user.getId()) >= NORMAL_DAILY_LIMIT) {
            req.setAttribute("error", "普通用户每天仅可测评一次");
            req.setAttribute("questions", mbtiDao.listQuestions());
            req.getRequestDispatcher("/WEB-INF/jsp/mbti-test.jsp").forward(req, resp);
            return;
        }

        List<MbtiQuestion> questions = mbtiDao.listQuestions();
        Map<String, Integer> score = new HashMap<>();
        for (MbtiQuestion q : questions) {
            String choice = req.getParameter("q_" + q.getId());
            if (choice == null) {
                continue;
            }
            String side = "A".equalsIgnoreCase(choice) ? q.getaSide() : q.getbSide();
            score.merge(side, 1, Integer::sum);
        }
        String type = pick(score, "E", "I") + pick(score, "S", "N") + pick(score, "T", "F") + pick(score, "J", "P");

        MbtiResult result = new MbtiResult();
        result.setUserId(user.getId());
        result.setMbtiType(type);
        result.setEiScore(score.getOrDefault("E", 0));
        result.setSnScore(score.getOrDefault("S", 0));
        result.setTfScore(score.getOrDefault("T", 0));
        result.setJpScore(score.getOrDefault("J", 0));
        mbtiDao.insertResult(result);

        user.setMbtiType(type);
        userDao.update(user);
        SessionUtil.login(req, user);
        req.setAttribute("type", type);
        req.setAttribute("result", result);
        req.getRequestDispatcher("/WEB-INF/jsp/mbti-result.jsp").forward(req, resp);
    }

    private String pick(Map<String, Integer> score, String a, String b) {
        return score.getOrDefault(a, 0) >= score.getOrDefault(b, 0) ? a : b;
    }
}
