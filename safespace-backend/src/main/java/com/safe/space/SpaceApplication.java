package com.safe.space;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.File;
import java.nio.file.Files;
import java.util.List;

@SpringBootApplication
public class SpaceApplication {

	public static void main(String[] args) {
		loadDotenv();
		SpringApplication.run(SpaceApplication.class, args);
	}

	private static void loadDotenv() {
		String[] candidatePaths = {
			".env",
			"safespace-backend/.env",
			"../.env",
			"./data/.env"
		};

		for (String path : candidatePaths) {
			File f = new File(path);
			if (f.exists() && f.isFile()) {
				try {
					List<String> lines = Files.readAllLines(f.toPath());
					for (String line : lines) {
						String trimmed = line.trim();
						if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
						int eqIdx = trimmed.indexOf('=');
						if (eqIdx > 0) {
							String key = trimmed.substring(0, eqIdx).trim();
							String value = trimmed.substring(eqIdx + 1).trim();
							if (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2) {
								value = value.substring(1, value.length() - 1);
							}
							if (System.getProperty(key) == null && System.getenv(key) == null) {
								System.setProperty(key, value);
							}
						}
					}
					System.out.println("✅ Loaded environment properties from " + f.getAbsolutePath());
					break;
				} catch (Exception e) {
					System.err.println("Warning: Could not read .env from " + path + ": " + e.getMessage());
				}
			}
		}
	}

}

