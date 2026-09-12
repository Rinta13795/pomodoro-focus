package com.mbti.course.dao;

import com.mbti.course.bean.MbtiQuestion;
import com.mbti.course.bean.MbtiResult;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;

public class MbtiDao extends BaseDao {

    private MbtiQuestion mapQuestion(ResultSet rs) throws SQLException {
        MbtiQuestion q = new MbtiQuestion();
        q.setId(rs.getLong("id"));
        q.setContent(rs.getString("content"));
        q.setOptionA(rs.getString("option_a"));
        q.setOptionB(rs.getString("option_b"));
        q.setDimension(rs.getString("dimension"));
        q.setaSide(rs.getString("a_side"));
        q.setbSide(rs.getString("b_side"));
        q.setSort(rs.getInt("sort"));
        return q;
    }

    private MbtiResult mapResult(ResultSet rs) throws SQLException {
        MbtiResult r = new MbtiResult();
        r.setId(rs.getLong("id"));
        r.setUserId(rs.getLong("user_id"));
        r.setMbtiType(rs.getString("mbti_type"));
        r.setEiScore(rs.getInt("ei_score"));
        r.setSnScore(rs.getInt("sn_score"));
        r.setTfScore(rs.getInt("tf_score"));
        r.setJpScore(rs.getInt("jp_score"));
        Object time = rs.getObject("create_time");
        if (time instanceof LocalDateTime ldt) {
            r.setCreateTime(ldt);
        }
        return r;
    }

    public List<MbtiQuestion> listQuestions() throws SQLException {
        return queryList("select * from mbti_question order by sort asc", this::mapQuestion);
    }

    public int countToday(Long userId) throws SQLException {
        return (int) queryLong("select count(*) from mbti_result where user_id = ? and date(create_time) = curdate()", userId);
    }

    public int insertResult(MbtiResult result) throws SQLException {
        return update("insert into mbti_result(user_id,mbti_type,ei_score,sn_score,tf_score,jp_score) values(?,?,?,?,?,?)",
                result.getUserId(), result.getMbtiType(), result.getEiScore(), result.getSnScore(), result.getTfScore(), result.getJpScore());
    }

    public List<MbtiResult> history(Long userId) throws SQLException {
        return queryList("select * from mbti_result where user_id = ? order by create_time desc", this::mapResult, userId);
    }
}
