package com.mbti.course.servlet;

import com.mbti.course.bean.PageResult;
import com.mbti.course.bean.Post;
import com.mbti.course.bean.User;
import com.mbti.course.dao.PostDao;
import com.mbti.course.dao.UserDao;
import com.mbti.course.util.PasswordUtil;
import com.mbti.course.util.SessionUtil;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;

@WebServlet({"/admin", "/admin/login", "/admin/users", "/admin/posts", "/admin/logout"})
public class AdminServlet extends BaseServlet {

    private final UserDao userDao = new UserDao();
    private final PostDao postDao = new PostDao();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        try {
            String uri = req.getRequestURI();
            if (uri.endsWith("/admin")) {
                if (!SessionUtil.isAdmin(req)) {
                    resp.sendRedirect(req.getContextPath() + "/admin/login");
                    return;
                }
                req.setAttribute("userCount", userDao.countAll());
                req.setAttribute("posts", postDao.page(1, 10).getRecords());
                req.getRequestDispatcher("/WEB-INF/jsp/admin.jsp").forward(req, resp);
            } else if (uri.endsWith("/admin/login")) {
                req.getRequestDispatcher("/WEB-INF/jsp/admin-login.jsp").forward(req, resp);
            } else if (uri.endsWith("/admin/logout")) {
                SessionUtil.logout(req);
                resp.sendRedirect(req.getContextPath() + "/admin/login");
            }
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        req.setCharacterEncoding("UTF-8");
        try {
            if (req.getRequestURI().endsWith("/admin/login")) {
                login(req, resp);
            }
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    private void login(HttpServletRequest req, HttpServletResponse resp) throws SQLException, IOException, ServletException {
        String username = req.getParameter("username");
        String password = req.getParameter("password");
        if (!"admin".equals(username) || !"admin123".equals(password)) {
            req.setAttribute("error", "管理员账号或密码错误");
            req.getRequestDispatcher("/WEB-INF/jsp/admin-login.jsp").forward(req, resp);
            return;
        }
        User admin = new User();
        admin.setUsername("admin");
        admin.setRole("ADMIN");
        admin.setNickname("管理员");
        SessionUtil.login(req, admin);
        resp.sendRedirect(req.getContextPath() + "/admin");
    }
}
