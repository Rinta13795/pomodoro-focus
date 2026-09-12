package com.mbti.course.bean;

import java.io.Serializable;

public class MbtiQuestion implements Serializable {
    private Long id;
    private String content;
    private String optionA;
    private String optionB;
    private String dimension;
    private String aSide;
    private String bSide;
    private Integer sort;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getOptionA() { return optionA; }
    public void setOptionA(String optionA) { this.optionA = optionA; }
    public String getOptionB() { return optionB; }
    public void setOptionB(String optionB) { this.optionB = optionB; }
    public String getDimension() { return dimension; }
    public void setDimension(String dimension) { this.dimension = dimension; }
    public String getaSide() { return aSide; }
    public void setaSide(String aSide) { this.aSide = aSide; }
    public String getbSide() { return bSide; }
    public void setbSide(String bSide) { this.bSide = bSide; }
    public Integer getSort() { return sort; }
    public void setSort(Integer sort) { this.sort = sort; }
}
