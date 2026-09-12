package com.mbti.course.servlet;

import com.mbti.course.bean.User;
import com.mbti.course.dao.UserDao;
import com.mbti.course.util.PasswordUtil;
import com.mbti.course.util.SessionUtil;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;

@WebServlet({"/login", "/register", "/logout"})
public class AuthServlet extends BaseServlet {

    private final UserDao userDao = new UserDao();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String uri = req.getRequestURI();
        if (uri.endsWith("/logout")) {
            SessionUtil.logout(req);
            resp.sendRedirect(req.getContextPath() + "/login");
            return;
        }
        req.getRequestDispatcher("/WEB-INF/jsp/" + (uri.endsWith("/register") ? "register" : "login") + ".jsp")
                .forward(req, resp);
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        req.setCharacterEncoding("UTF-8");
        resp.setContentType("text/html;charset=UTF-8");
        String uri = req.getRequestURI();
        try {
            if (uri.endsWith("/register")) {
                register(req, resp);
            } else if (uri.endsWith("/login")) {
                login(req, resp);
            }
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    private void register(HttpServletRequest req, HttpServletResponse resp) throws SQLException, IOException, ServletException {
        String username = req.getParameter("username");
        String password = req.getParameter("password");
        String nickname = req.getParameter("nickname");
        String email = req.getParameter("email");
        String phone = req.getParameter("phone");
        if (username == null || password == null || username.isBlank() || password.isBlank()) {
            req.setAttribute("error", "用户名和密码不能为空");
            req.getRequestDispatcher("/WEB-INF/jsp/register.jsp").forward(req, resp);
            return;
        }
        if (userDao.findByUsername(username) != null) {
            req.setAttribute("error", "用户名已存在");
            req.getRequestDispatcher("/WEB-INF/jsp/register.jsp").forward(req, resp);
            return;
        }
        User user = new User();
        user.setUsername(username.trim());
        user.setPassword(PasswordUtil.hash(password));
        user.setNickname(nickname == null || nickname.isBlank() ? username : nickname);
        user.setEmail(email);
        user.setPhone(phone);
        user.setRole("USER");
        user.setStatus(0);
        userDao.insert(user);
        resp.sendRedirect(req.getContextPath() + "/login");
    }

    private void login(HttpServletRequest req, HttpServletResponse resp) throws SQLException, IOException, ServletException {
        String username = req.getParameter("username");
        String password = req.getParameter("password");
        User user = userDao.findByUsername(username);
        if (user == null || !PasswordUtil.matches(password, user.getPassword())) {
            req.setAttribute("error", "用户名或密码错误");
            req.getRequestDispatcher("/WEB-INF/jsp/login.jsp").forward(req, resp);
            return;
        }
        if (user.getStatus() != null && user.getStatus() == 1) {
            req.setAttribute("error", "账号已被封禁");
            req.getRequestDispatcher("/WEB-INF/jsp/login.jsp").forward(req, resp);
            return;
        }
        SessionUtil.login(req, user);
        resp.sendRedirect(req.getContextPath() + "/home");
    }
}
