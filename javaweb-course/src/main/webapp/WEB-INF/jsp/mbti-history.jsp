<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>测评历史</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div class="card">
        <h2>测评历史</h2>
        <table class="table">
            <tr><th>ID</th><th>类型</th><th>E分</th><th>S分</th><th>T分</th><th>J分</th><th>时间</th></tr>
            <c:forEach var="r" items="${history}">
                <tr><td>${r.id}</td><td>${r.mbtiType}</td><td>${r.eiScore}</td><td>${r.snScore}</td><td>${r.tfScore}</td><td>${r.jpScore}</td><td>${r.createTime}</td></tr>
            </c:forEach>
        </table>
    </div>
</main>
</body>
</html>
