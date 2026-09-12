package com.mbti.course.servlet;

import com.mbti.course.bean.ChatMessage;
import com.mbti.course.bean.User;
import com.mbti.course.dao.MessageDao;
import com.mbti.course.util.SessionUtil;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;

@WebServlet({"/chat", "/chat/send"})
public class ChatServlet extends BaseServlet {

    private final MessageDao messageDao = new MessageDao();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        try {
            User me = SessionUtil.currentUser(req);
            Long friendId = Long.valueOf(req.getParameter("friendId"));
            req.setAttribute("friendId", friendId);
            req.setAttribute("friendName", req.getParameter("name"));
            req.setAttribute("messages", messageDao.history(me.getId(), friendId));
            req.getRequestDispatcher("/WEB-INF/jsp/chat.jsp").forward(req, resp);
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        req.setCharacterEncoding("UTF-8");
        try {
            User me = SessionUtil.currentUser(req);
            Long friendId = Long.valueOf(req.getParameter("friendId"));
            String content = req.getParameter("content");
            if (me != null && content != null && !content.isBlank()) {
                ChatMessage msg = new ChatMessage();
                msg.setFromId(me.getId());
                msg.setToId(friendId);
                msg.setContent(content);
                messageDao.insert(msg);
            }
            resp.sendRedirect(req.getContextPath() + "/chat?friendId=" + friendId + "&name=" + req.getParameter("friendName"));
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }
}
