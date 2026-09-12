package com.mbti.course.util;

import com.mbti.course.bean.User;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;

public final class SessionUtil {

    private SessionUtil() {
    }

    public static User currentUser(HttpServletRequest request) {
        return (User) request.getSession().getAttribute("currentUser");
    }

    public static void login(HttpServletRequest request, User user) {
        request.getSession().setAttribute("currentUser", user);
    }

    public static void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }

    public static boolean isAdmin(HttpServletRequest request) {
        User user = currentUser(request);
        return user != null && "ADMIN".equalsIgnoreCase(user.getRole());
    }
}
