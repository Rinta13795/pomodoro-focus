package com.mbti.course.dao;

import com.mbti.course.bean.ChatMessage;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;

public class MessageDao extends BaseDao {

    private ChatMessage map(ResultSet rs) throws SQLException {
        ChatMessage m = new ChatMessage();
        m.setId(rs.getLong("id"));
        m.setFromId(rs.getLong("from_id"));
        m.setToId(rs.getLong("to_id"));
        m.setContent(rs.getString("content"));
        m.setIsRead(rs.getInt("is_read"));
        Object ct = rs.getObject("create_time");
        if (ct instanceof LocalDateTime ldt) {
            m.setCreateTime(ldt);
        }
        return m;
    }

    public int insert(ChatMessage message) throws SQLException {
        return update("insert into message(from_id,to_id,content,is_read) values(?,?,?,0)",
                message.getFromId(), message.getToId(), message.getContent());
    }

    public List<ChatMessage> history(Long myId, Long friendId) throws SQLException {
        return queryList(
                "select * from message where (from_id=? and to_id=?) or (from_id=? and to_id=?) order by create_time asc",
                this::map, myId, friendId, friendId, myId);
    }
}
