package com.safe.space.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PostRequest {

    private String content;

    private String emotionTag;

    private int energyScore;

    /**
     * Optional pseudonym. If blank, the server generates one automatically.
     */
    private String pseudonym;
}
