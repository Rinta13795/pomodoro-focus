package com.mbti.course.servlet;

import com.mbti.course.bean.CourseResource;
import com.mbti.course.bean.User;
import com.mbti.course.dao.ResourceDao;
import com.mbti.course.util.SessionUtil;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.SQLException;
import java.util.List;

@WebServlet({"/resource", "/resource/upload", "/resource/download"})
public class ResourceServlet extends BaseServlet {

    private final ResourceDao resourceDao = new ResourceDao();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        try {
            List<CourseResource> resources = resourceDao.list();
            req.setAttribute("resources", resources);
            req.getRequestDispatcher("/WEB-INF/jsp/resource.jsp").forward(req, resp);
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        try {
            String uri = req.getRequestURI();
            if (uri.endsWith("/download")) {
                download(req, resp);
            }
        } catch (SQLException e) {
            throw new ServletException(e);
        }
    }

    private void download(HttpServletRequest req, HttpServletResponse resp) throws SQLException, IOException {
        Long id = Long.valueOf(req.getParameter("id"));
        CourseResource resource = resourceDao.findById(id);
        if (resource != null) {
            resourceDao.increaseDownload(id, (resource.getDownloadCount() == null ? 0 : resource.getDownloadCount()) + 1);
        }
        resp.sendRedirect(req.getContextPath() + "/resource");
    }
}
