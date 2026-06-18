package com.safe.space.repository;

import com.safe.space.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);

    Optional<User> findByInstitutionalId(String institutionalId);

    boolean existsByUsername(String username);

    boolean existsByInstitutionalId(String institutionalId);

    /** All users by role, sorted by name. */
    List<User> findByRoleOrderByFullNameAsc(String role);

    /** Active users by role. */
    List<User> findByRoleAndActiveTrueOrderByFullNameAsc(String role);

    /** Count by role. */
    @Query("SELECT u.role, COUNT(u) FROM User u GROUP BY u.role")
    List<Object[]> countByRole();

    /** Count active users. */
    long countByActiveTrue();

    /** Search by name or institutional ID (case-insensitive). */
    @Query("SELECT u FROM User u WHERE LOWER(u.fullName) LIKE LOWER(CONCAT('%', :query, '%')) OR u.institutionalId LIKE CONCAT('%', :query, '%')")
    List<User> searchByNameOrId(String query);
}
