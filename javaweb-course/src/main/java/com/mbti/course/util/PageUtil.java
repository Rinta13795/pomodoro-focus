package com.mbti.course.util;

public final class PageUtil {

    private PageUtil() {
    }

    public static int page(int value) {
        return Math.max(value, 1);
    }

    public static int size(int value) {
        return value <= 0 ? 10 : Math.min(value, 50);
    }
}
