package com.safe.space.repository;

import com.safe.space.model.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    /** All messages in a session, chronological order. */
    List<ChatMessage> findBySessionIdOrderBySentAtAsc(String sessionId);

    /** Count of unread messages for a recipient in a session. */
    long countBySessionIdAndSenderTypeNotAndReadFalse(String sessionId, String recipientType);

    /** Count all messages in a session. */
    long countBySessionId(String sessionId);

    /** Count messages by sender type in a session (for fallback logic). */
    long countBySessionIdAndSenderType(String sessionId, String senderType);
}
