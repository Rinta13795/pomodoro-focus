package com.mbti.course.util;

public final class SqlUtil {

    private SqlUtil() {
    }

    public static String like(String value) {
        return "%" + value + "%";
    }
}
