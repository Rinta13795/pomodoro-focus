<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>论坛</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div style="display:flex;justify-content:space-between;align-items:center"><h2>论坛</h2><a class="btn" href="${pageContext.request.contextPath}/post">发帖</a></div>
    <c:forEach var="p" items="${pageResult.records}">
        <div class="card">
            <div class="post-title"><a href="${pageContext.request.contextPath}/post/detail?id=${p.id}">${p.title}</a></div>
            <p>${p.content}</p>
            <p class="muted">浏览 ${p.viewCount} · 评论 ${p.commentCount} · ${p.createTime}</p>
        </div>
    </c:forEach>
    <div class="card muted">共 ${pageResult.total} 条，当前第 ${pageResult.page} 页</div>
</main>
</body>
</html>
