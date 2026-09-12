package com.mbti.course.dao;

import com.mbti.course.bean.Admin;

import java.sql.ResultSet;
import java.sql.SQLException;

public class AdminDao extends BaseDao {

    private Admin mapAdmin(ResultSet rs) throws SQLException {
        Admin a = new Admin();
        a.setId(rs.getLong("id"));
        a.setUsername(rs.getString("username"));
        a.setPassword(rs.getString("password"));
        return a;
    }

    public Admin findByUsername(String username) throws SQLException {
        return queryOne("select * from admin where username = ?", this::mapAdmin, username);
    }
}
