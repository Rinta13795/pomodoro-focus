<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>帖子详情</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div class="card">
        <h2>${post.title}</h2>
        <p class="muted">浏览 ${post.viewCount} · 评论 ${post.commentCount}</p>
        <p>${post.content}</p>
    </div>
    <div class="card">
        <h3>评论</h3>
        <form method="post" action="${pageContext.request.contextPath}/post/comment">
            <input type="hidden" name="postId" value="${post.id}">
            <textarea name="content" required placeholder="说点什么"></textarea>
            <button class="btn">评论</button>
        </form>
        <c:forEach var="c" items="${comments}">
            <p><strong>用户${c.userId}</strong>：${c.content} <span class="muted">${c.createTime}</span></p>
        </c:forEach>
    </div>
</main>
</body>
</html>
