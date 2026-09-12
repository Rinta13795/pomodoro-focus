package com.mbti.course.servlet;

import com.google.gson.Gson;

import javax.servlet.http.HttpServlet;

public abstract class BaseServlet extends HttpServlet {
    protected static final Gson GSON = new Gson();
}
