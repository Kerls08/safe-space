package com.safe.space;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
		"spring.jpa.hibernate.ddl-auto=create-drop"
})
class SpaceApplicationTests {

	@Test
	void contextLoads() {
	}

}
