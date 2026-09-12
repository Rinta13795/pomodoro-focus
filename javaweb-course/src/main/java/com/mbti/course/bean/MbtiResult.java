package com.mbti.course.bean;

import java.io.Serializable;
import java.time.LocalDateTime;

public class MbtiResult implements Serializable {
    private Long id;
    private Long userId;
    private String mbtiType;
    private Integer eiScore;
    private Integer snScore;
    private Integer tfScore;
    private Integer jpScore;
    private LocalDateTime createTime;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getMbtiType() { return mbtiType; }
    public void setMbtiType(String mbtiType) { this.mbtiType = mbtiType; }
    public Integer getEiScore() { return eiScore; }
    public void setEiScore(Integer eiScore) { this.eiScore = eiScore; }
    public Integer getSnScore() { return snScore; }
    public void setSnScore(Integer snScore) { this.snScore = snScore; }
    public Integer getTfScore() { return tfScore; }
    public void setTfScore(Integer tfScore) { this.tfScore = tfScore; }
    public Integer getJpScore() { return jpScore; }
    public void setJpScore(Integer jpScore) { this.jpScore = jpScore; }
    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }
}
