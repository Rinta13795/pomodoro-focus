<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%@ taglib prefix="mbti" uri="http://mbti.course/tags" %>
<!doctype html>
<html>
<head>
    <meta charset="UTF-8">
    <title>MBTI交友系统</title>
    <link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css">
</head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <section class="hero">
        <h1>基于 MBTI 的交友系统</h1>
        <p>当前用户：<strong>${sessionScope.currentUser.nickname}</strong>
            <span class="tag">${sessionScope.currentUser.role}</span>
            MBTI：<mbti:badge type="${sessionScope.currentUser.mbtiType}"/>
        </p>
        <p class="muted">系统采用 JSP + Servlet + JavaBean + JDBC 的 MVC 架构，实现用户、测评、推荐、论坛、资源、好友与后台管理。</p>
    </section>
    <section class="grid" style="margin-top:18px">
        <div class="card"><h3>MBTI 测评</h3><p class="muted">完成 16 题测评，生成最近人格类型。</p><a class="btn" href="${pageContext.request.contextPath}/mbti/test">开始测评</a></div>
        <div class="card"><h3>智能推荐</h3><p class="muted">根据人格相容度推荐潜在好友和热门帖子。</p><a class="btn" href="${pageContext.request.contextPath}/recommend">查看推荐</a></div>
        <div class="card"><h3>社区论坛</h3><p class="muted">发布帖子、阅读详情、发表评论。</p><a class="btn" href="${pageContext.request.contextPath}/forum">进入论坛</a></div>
    </section>
</main>
</body>
</html>
