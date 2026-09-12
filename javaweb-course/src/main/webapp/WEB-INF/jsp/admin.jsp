<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>后台管理</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div class="card">
        <h2>管理后台</h2>
        <p>注册用户数：<strong>${userCount}</strong></p>
        <p class="muted">后台提供用户统计、帖子查看等管理能力，体现前后台分离和角色权限管理。</p>
    </div>
    <div class="card">
        <h3>最新帖子</h3>
        <table class="table">
            <tr><th>ID</th><th>标题</th><th>作者ID</th><th>浏览</th><th>评论</th></tr>
            <c:forEach var="p" items="${posts}">
                <tr><td>${p.id}</td><td>${p.title}</td><td>${p.userId}</td><td>${p.viewCount}</td><td>${p.commentCount}</td></tr>
            </c:forEach>
        </table>
    </div>
</main>
</body>
</html>
