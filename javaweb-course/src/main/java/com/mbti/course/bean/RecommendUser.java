package com.mbti.course.bean;

import java.io.Serializable;

public class RecommendUser implements Serializable {
    private Long userId;
    private String nickname;
    private String mbtiType;
    private String avatar;
    private double cfSimilarity;
    private double mbtiCompat;
    private double score;
    private String reason;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }
    public String getMbtiType() { return mbtiType; }
    public void setMbtiType(String mbtiType) { this.mbtiType = mbtiType; }
    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }
    public double getCfSimilarity() { return cfSimilarity; }
    public void setCfSimilarity(double cfSimilarity) { this.cfSimilarity = cfSimilarity; }
    public double getMbtiCompat() { return mbtiCompat; }
    public void setMbtiCompat(double mbtiCompat) { this.mbtiCompat = mbtiCompat; }
    public double getScore() { return score; }
    public void setScore(double score) { this.score = score; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
