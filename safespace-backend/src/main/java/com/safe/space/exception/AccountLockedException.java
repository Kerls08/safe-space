package com.safe.space.exception;

/**
 * Exception thrown when an account is temporarily locked due to too many failed login attempts.
 */
public class AccountLockedException extends RuntimeException {

    private final long secondsRemaining;

    public AccountLockedException(String message, long secondsRemaining) {
        super(message);
        this.secondsRemaining = secondsRemaining;
    }

    public long getSecondsRemaining() {
        return secondsRemaining;
    }
}
