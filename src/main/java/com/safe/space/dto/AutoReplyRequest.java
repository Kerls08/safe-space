package com.safe.space.dto;

import lombok.*;

/**
 * Request DTO for generating or previewing an auto-reply.
 * Can be used standalone (preview mode) or as part of post creation.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AutoReplyRequest {

    /** The emotion tag selected by the user. */
    private String emotionTag;

    /** Energy score from 1 to 10. */
    private int energyScore;

    /** Optional post content — used for crisis keyword detection. */
    private String content;

    /** Optional postId — links the reply to an existing post for logging. */
    private String postId;
}
