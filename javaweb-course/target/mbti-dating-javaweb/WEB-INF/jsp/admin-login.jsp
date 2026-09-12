<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>后台登录</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<div class="auth-wrap">
    <form class="auth-card" method="post" action="${pageContext.request.contextPath}/admin/login">
        <h2>管理员登录</h2>
        <p class="muted">默认账号：admin / admin123</p>
        <c:if test="${not empty error}"><div class="error">${error}</div></c:if>
        <label>账号</label><input name="username" required>
        <label>密码</label><input type="password" name="password" required>
        <button class="btn" style="width:100%">登录后台</button>
    </form>
</div>
</body>
</html>
