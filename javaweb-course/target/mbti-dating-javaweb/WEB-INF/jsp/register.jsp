<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head>
    <meta charset="UTF-8">
    <title>注册</title>
    <link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css">
</head>
<body>
<div class="auth-wrap">
    <form class="auth-card" method="post" action="${pageContext.request.contextPath}/register">
        <h2>注册</h2>
        <c:if test="${not empty error}"><div class="error">${error}</div></c:if>
        <label>用户名</label><input name="username" required minlength="3" maxlength="20">
        <label>密码</label><input type="password" name="password" required minlength="6" maxlength="20">
        <label>昵称</label><input name="nickname">
        <label>邮箱</label><input name="email" type="email">
        <label>手机号</label><input name="phone" pattern="^1[3-9][0-9]{9}$">
        <button class="btn" style="width:100%">注册</button>
        <p class="muted">已有账号？<a href="${pageContext.request.contextPath}/login">去登录</a></p>
    </form>
</div>
</body>
</html>
