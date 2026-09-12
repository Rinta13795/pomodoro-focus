<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head>
    <meta charset="UTF-8">
    <title>登录</title>
    <link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css">
</head>
<body>
<div class="auth-wrap">
    <form class="auth-card" method="post" action="${pageContext.request.contextPath}/login">
        <h2>登录</h2>
        <p class="muted">使用账号进入 MBTI 交友系统</p>
        <c:if test="${not empty error}"><div class="error">${error}</div></c:if>
        <label>用户名</label>
        <input name="username" required>
        <label>密码</label>
        <input type="password" name="password" required>
        <button class="btn" style="width:100%">登录</button>
        <p class="muted">没有账号？<a href="${pageContext.request.contextPath}/register">去注册</a></p>
    </form>
</div>
</body>
</html>
