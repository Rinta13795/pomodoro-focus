<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>私聊</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div class="card">
        <h2>与 ${friendName} 聊天</h2>
        <div class="chat-box">
            <c:forEach var="m" items="${messages}">
                <p><strong>${m.fromId == sessionScope.currentUser.id ? '我' : friendName}：</strong>${m.content} <span class="muted">${m.createTime}</span></p>
            </c:forEach>
        </div>
        <form method="post" action="${pageContext.request.contextPath}/chat/send">
            <input type="hidden" name="friendId" value="${friendId}">
            <input type="hidden" name="friendName" value="${friendName}">
            <textarea name="content" required placeholder="输入消息"></textarea>
            <button class="btn">发送</button>
        </form>
    </div>
</main>
</body>
</html>
