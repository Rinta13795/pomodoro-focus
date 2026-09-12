package com.mbti.course.tag;

import javax.servlet.jsp.JspException;
import javax.servlet.jsp.tagext.SimpleTagSupport;
import java.io.IOException;

public class MbtiTag extends SimpleTagSupport {

    private String type;

    public void setType(String type) {
        this.type = type;
    }

    @Override
    public void doTag() throws JspException, IOException {
        String value = type == null || type.isBlank() ? "未测评" : type;
        getJspContext().getOut().write("<span class=\"tag\">" + value + "</span>");
    }
}
