<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>好友</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div class="card">
        <h2>好友申请</h2>
        <c:forEach var="a" items="${applies}">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;padding:10px 0">
                <span>用户 ${a.userId} 申请加你为好友</span>
                <form method="post" action="${pageContext.request.contextPath}/friend/handle">
                    <input type="hidden" name="id" value="${a.id}">
                    <button class="btn" name="agree" value="true">同意</button>
                    <button class="btn secondary" name="agree" value="false">拒绝</button>
                </form>
            </div>
        </c:forEach>
        <c:if test="${empty applies}"><p class="muted">暂无申请</p></c:if>
    </div>
    <div class="card">
        <h2>我的好友</h2>
        <div class="grid">
            <c:forEach var="f" items="${friends}">
                <div class="card">
                    <div class="tag">${empty f.mbtiType ? '?' : f.mbtiType}</div>
                    <h3>${f.nickname}</h3>
                    <a class="btn" href="${pageContext.request.contextPath}/chat?friendId=${f.id}&name=${f.nickname}">私聊</a>
                </div>
            </c:forEach>
        </div>
        <c:if test="${empty friends}"><p class="muted">还没有好友，可以从推荐页发起申请。</p></c:if>
    </div>
</main>
</body>
</html>
