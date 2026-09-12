package com.mbti.course.dao;

import com.mbti.course.bean.User;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

public class UserDao extends BaseDao {

    private User mapUser(ResultSet rs) throws SQLException {
        User u = new User();
        u.setId(rs.getLong("id"));
        u.setUsername(rs.getString("username"));
        u.setPassword(rs.getString("password"));
        u.setNickname(rs.getString("nickname"));
        u.setAvatar(rs.getString("avatar"));
        u.setGender(rs.getInt("gender"));
        u.setEmail(rs.getString("email"));
        u.setPhone(rs.getString("phone"));
        u.setMbtiType(rs.getString("mbti_type"));
        u.setRole(rs.getString("role"));
        u.setStatus(rs.getInt("status"));
        u.setIntro(rs.getString("intro"));
        return u;
    }

    public User findByUsername(String username) throws SQLException {
        return queryOne("select * from user where username = ? and deleted = 0", this::mapUser, username);
    }

    public User findById(Long id) throws SQLException {
        return queryOne("select * from user where id = ? and deleted = 0", this::mapUser, id);
    }

    public List<User> findAll(int limit, int offset) throws SQLException {
        return queryList("select * from user where deleted = 0 order by id desc limit ? offset ?",
                this::mapUser, limit, offset);
    }

    public long countAll() throws SQLException {
        return queryLong("select count(*) from user where deleted = 0");
    }

    public int insert(User user) throws SQLException {
        return update("insert into user(username,password,nickname,avatar,gender,email,phone,mbti_type,role,status,intro) values(?,?,?,?,?,?,?,?,?,?,?)",
                user.getUsername(), user.getPassword(), user.getNickname(), user.getAvatar(), user.getGender(),
                user.getEmail(), user.getPhone(), user.getMbtiType(), user.getRole(), user.getStatus(), user.getIntro());
    }

    public int update(User user) throws SQLException {
        return update("update user set nickname=?, avatar=?, gender=?, email=?, phone=?, mbti_type=?, role=?, status=?, intro=? where id=?",
                user.getNickname(), user.getAvatar(), user.getGender(), user.getEmail(), user.getPhone(),
                user.getMbtiType(), user.getRole(), user.getStatus(), user.getIntro(), user.getId());
    }

    public int updatePassword(Long id, String password) throws SQLException {
        return update("update user set password=? where id=?", password, id);
    }
}
