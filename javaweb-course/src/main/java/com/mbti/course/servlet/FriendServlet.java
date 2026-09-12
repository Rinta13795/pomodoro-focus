package com.mbti.course.servlet;

import com.mbti.course.bean.FriendRequest;
import com.mbti.course.bean.User;
import com.mbti.course.dao.FriendDao;
import com.mbti.course.util.SessionUtil;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;
import java.util.List;

@WebServlet({"/friends", "/friend/apply", "/friend/handle"})
public class FriendServlet extends BaseServlet {

    private final FriendDao friendDao = new FriendDao();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        try {
            User me = SessionUtil.currentUser(req);
            if (me == null) {
                resp.sendRedirect(req.getContextPath() + "/login");
                return;
            }
            List<FriendRequest> applies = friendDao.applies(me.getId());
            req.setAttribute("applies", applies);
            req.setAttribute("friends", friendDao.listFriends(me.getId()));
            req.getRequestDispatcher("/WEB-INF/jsp/friends.jsp").forward(req, resp);
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        req.setCharacterEncoding("UTF-8");
        try {
            User me = SessionUtil.currentUser(req);
            if (me == null) {
                resp.sendRedirect(req.getContextPath() + "/login");
                return;
            }
            String uri = req.getRequestURI();
            if (uri.endsWith("/friend/apply")) {
                Long friendId = Long.valueOf(req.getParameter("friendId"));
                if (!me.getId().equals(friendId) && friendDao.exists(me.getId(), friendId) == 0) {
                    friendDao.apply(me.getId(), friendId);
                }
            } else if (uri.endsWith("/friend/handle")) {
                Long id = Long.valueOf(req.getParameter("id"));
                int status = "true".equals(req.getParameter("agree")) ? 1 : 2;
                friendDao.updateStatus(id, status);
            }
            resp.sendRedirect(req.getContextPath() + "/friends");
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }
}
