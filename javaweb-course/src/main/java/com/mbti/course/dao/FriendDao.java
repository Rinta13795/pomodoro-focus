package com.mbti.course.dao;

import com.mbti.course.bean.FriendRequest;
import com.mbti.course.bean.User;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class FriendDao extends BaseDao {

    private FriendRequest map(ResultSet rs) throws SQLException {
        FriendRequest f = new FriendRequest();
        f.setId(rs.getLong("id"));
        f.setUserId(rs.getLong("user_id"));
        f.setFriendId(rs.getLong("friend_id"));
        f.setStatus(rs.getInt("status"));
        Object ct = rs.getObject("create_time");
        if (ct instanceof LocalDateTime ldt) {
            f.setCreateTime(ldt);
        }
        return f;
    }

    public int apply(Long userId, Long friendId) throws SQLException {
        return update("insert into friend(user_id,friend_id,status) values(?,?,0)", userId, friendId);
    }

    public int exists(Long userId, Long friendId) throws SQLException {
        return (int) queryLong("select count(*) from friend where user_id = ? and friend_id = ?", userId, friendId);
    }

    public List<FriendRequest> applies(Long friendId) throws SQLException {
        return queryList("select * from friend where friend_id = ? and status = 0 order by create_time desc", this::map, friendId);
    }

    public FriendRequest findById(Long id) throws SQLException {
        return queryOne("select * from friend where id = ?", this::map, id);
    }

    public int updateStatus(Long id, int status) throws SQLException {
        return update("update friend set status=? where id=?", status, id);
    }

    public List<Long> friendIds(Long userId) throws SQLException {
        List<FriendRequest> rels = queryList(
                "select * from friend where status = 1 and (user_id = ? or friend_id = ?)", this::map, userId, userId);
        List<Long> ids = new ArrayList<>();
        for (FriendRequest r : rels) {
            ids.add(r.getUserId().equals(userId) ? r.getFriendId() : r.getUserId());
        }
        return ids;
    }

    public List<User> listFriends(Long userId) throws SQLException {
        List<Long> ids = friendIds(userId);
        if (ids.isEmpty()) {
            return List.of();
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        return queryList("select * from user where id in (" + placeholders + ") and deleted = 0", rs -> {
            User u = new User();
            u.setId(rs.getLong("id"));
            u.setUsername(rs.getString("username"));
            u.setNickname(rs.getString("nickname"));
            u.setAvatar(rs.getString("avatar"));
            u.setMbtiType(rs.getString("mbti_type"));
            u.setRole(rs.getString("role"));
            u.setStatus(rs.getInt("status"));
            return u;
        }, ids.toArray());
    }
}
