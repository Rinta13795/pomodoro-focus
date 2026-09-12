package com.mbti.course.dao;

import com.mbti.course.bean.CourseResource;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;

public class ResourceDao extends BaseDao {

    private CourseResource map(ResultSet rs) throws SQLException {
        CourseResource r = new CourseResource();
        r.setId(rs.getLong("id"));
        r.setUserId(rs.getLong("user_id"));
        r.setName(rs.getString("name"));
        r.setFileUrl(rs.getString("file_url"));
        r.setFileSize(rs.getLong("file_size"));
        r.setDownloadCount(rs.getInt("download_count"));
        r.setStatus(rs.getInt("status"));
        Object ct = rs.getObject("create_time");
        if (ct instanceof LocalDateTime ldt) {
            r.setCreateTime(ldt);
        }
        return r;
    }

    public List<CourseResource> list() throws SQLException {
        return queryList("select * from resource where deleted = 0 and status = 0 order by create_time desc", this::map);
    }

    public CourseResource findById(Long id) throws SQLException {
        return queryOne("select * from resource where id = ? and deleted = 0", this::map, id);
    }

    public int insert(CourseResource resource) throws SQLException {
        return update("insert into resource(user_id,name,file_url,file_size,download_count,status) values(?,?,?,?,?,?)",
                resource.getUserId(), resource.getName(), resource.getFileUrl(), resource.getFileSize(),
                resource.getDownloadCount(), resource.getStatus());
    }

    public int increaseDownload(Long id, int downloadCount) throws SQLException {
        return update("update resource set download_count=? where id=?", downloadCount, id);
    }
}
