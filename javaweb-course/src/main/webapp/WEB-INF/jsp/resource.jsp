<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<!doctype html>
<html>
<head><meta charset="UTF-8"><title>资源共享</title><link rel="stylesheet" href="${pageContext.request.contextPath}/assets/style.css"></head>
<body>
<jsp:include page="/WEB-INF/jsp/common/header.jsp"/>
<main class="container">
    <div class="card">
        <h2>资源共享</h2>
        <p class="muted">课程设计演示版保留资源列表和下载计数，实际文件上传可在后续扩展。</p>
        <table class="table">
            <tr><th>名称</th><th>大小</th><th>下载次数</th><th>操作</th></tr>
            <c:forEach var="r" items="${resources}">
                <tr>
                    <td>${r.name}</td><td>${r.fileSize}</td><td>${r.downloadCount}</td>
                    <td>
                        <form method="post" action="${pageContext.request.contextPath}/resource/download">
                            <input type="hidden" name="id" value="${r.id}">
                            <button class="btn secondary">下载</button>
                        </form>
                    </td>
                </tr>
            </c:forEach>
        </table>
    </div>
</main>
</body>
</html>
