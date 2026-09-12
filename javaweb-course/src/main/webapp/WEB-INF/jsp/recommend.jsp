<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>智能推荐</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <h2>为你推荐</h2>
    <h3>可能合拍的人</h3>
    <div class="grid">
        <c:forEach var="u" items="${users}">
            <div class="card">
                <div class="tag">${empty u.mbtiType ? '?' : u.mbtiType}</div>
                <h3>${u.nickname}</h3>
                <p class="muted">匹配度：${u.score}</p>
                <p>${u.reason}</p>
                <form method="post" action="${pageContext.request.contextPath}/friend/apply">
                    <input type="hidden" name="friendId" value="${u.userId}">
                    <button class="btn">申请好友</button>
                </form>
            </div>
        </c:forEach>
    </div>
    <h3>热门帖子</h3>
    <div class="grid">
        <c:forEach var="p" items="${posts}">
            <div class="card">
                <div class="post-title">${p.title}</div>
                <p class="muted">浏览 ${p.viewCount} · 评论 ${p.commentCount}</p>
                <a class="btn secondary" href="${pageContext.request.contextPath}/post/detail?id=${p.id}">查看</a>
            </div>
        </c:forEach>
    </div>
</main>
</body>
</html>
