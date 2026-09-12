<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head>
    <meta charset="UTF-8">
    <title>测评结果</title>
    <link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css">
</head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div class="card" style="text-align:center">
        <h2>你的 MBTI 类型</h2>
        <div style="font-size:64px;font-weight:800;color:#3157d5">${empty type ? sessionScope.currentUser.mbtiType : type}</div>
        <p class="muted">该结果已同步到个人资料，用于好友推荐。</p>
        <a class="btn" href="${pageContext.request.contextPath}/recommend">查看推荐好友</a>
        <a class="btn secondary" href="${pageContext.request.contextPath}/mbti/test">重新测评</a>
    </div>
</main>
</body>
</html>
