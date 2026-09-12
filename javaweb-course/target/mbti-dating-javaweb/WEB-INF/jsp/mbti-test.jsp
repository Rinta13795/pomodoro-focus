<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head>
    <meta charset="UTF-8">
    <title>MBTI测评</title>
    <link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css">
</head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div class="card">
        <h2>MBTI 人格测评</h2>
        <p class="muted">请选择每题更接近你的选项，提交后生成 16 型人格结果。</p>
        <c:if test="${not empty error}"><div class="error">${error}</div></c:if>
        <form method="post" action="${pageContext.request.contextPath}/mbti/submit">
            <c:forEach var="q" items="${questions}" varStatus="s">
                <div class="question">
                    <strong>${s.index + 1}. ${q.content}</strong>
                    <div class="options">
                        <label><input type="radio" name="q_${q.id}" value="A" required> ${q.optionA}</label>
                        <label><input type="radio" name="q_${q.id}" value="B" required> ${q.optionB}</label>
                    </div>
                </div>
            </c:forEach>
            <button class="btn" style="margin-top:18px">提交测评</button>
        </form>
    </div>
</main>
</body>
</html>
