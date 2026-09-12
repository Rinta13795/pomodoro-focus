<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>发布帖子</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <form class="card" method="post" action="${pageContext.request.contextPath}/post">
        <h2>发布帖子</h2>
        <label>标题</label><input name="title" required maxlength="120">
        <label>内容</label><textarea name="content" required></textarea>
        <button class="btn">发布</button>
    </form>
</main>
</body>
</html>
