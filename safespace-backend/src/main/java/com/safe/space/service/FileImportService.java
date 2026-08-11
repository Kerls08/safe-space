package com.safe.space.service;

import com.safe.space.dto.AuthDTOs.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.util.*;

/**
 * File Import Service.
 *
 * Parses uploaded Excel (.xlsx, .xls) and CSV files into user registration
 * records for bulk account creation. Delegates actual registration to
 * CredentialService.batchImport().
 *
 * Expected columns (flexible, case-insensitive matching):
 *   - Institutional ID  (aliases: "Student ID", "ID", "Employee ID", "ID Number")
 *   - Full Name         (aliases: "Name", "Student Name", "Employee Name")
 *   - Email             (optional)
 *   - Department        (aliases: "Program", "Course", "Dept")
 *   - Year Level        (aliases: "Year", "Level", "Grade")
 *   - Role              (aliases: "Type", "User Type"; defaults to STUDENT if missing)
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FileImportService {

    private final CredentialService credentialService;

    // Column name → field mapping (all lowercase for matching)
    private static final Map<String, String> COLUMN_ALIASES = new LinkedHashMap<>();
    static {
        // institutionalId
        COLUMN_ALIASES.put("institutional id", "institutionalId");
        COLUMN_ALIASES.put("institutionalid", "institutionalId");
        COLUMN_ALIASES.put("student id", "institutionalId");
        COLUMN_ALIASES.put("id", "institutionalId");
        COLUMN_ALIASES.put("employee id", "institutionalId");
        COLUMN_ALIASES.put("id number", "institutionalId");
        COLUMN_ALIASES.put("id no", "institutionalId");
        COLUMN_ALIASES.put("id no.", "institutionalId");
        // fullName
        COLUMN_ALIASES.put("full name", "fullName");
        COLUMN_ALIASES.put("fullname", "fullName");
        COLUMN_ALIASES.put("name", "fullName");
        COLUMN_ALIASES.put("student name", "fullName");
        COLUMN_ALIASES.put("employee name", "fullName");
        // email
        COLUMN_ALIASES.put("email", "email");
        COLUMN_ALIASES.put("email address", "email");
        COLUMN_ALIASES.put("e-mail", "email");
        // department
        COLUMN_ALIASES.put("department", "department");
        COLUMN_ALIASES.put("dept", "department");
        COLUMN_ALIASES.put("program", "department");
        COLUMN_ALIASES.put("course", "department");
        // yearLevel
        COLUMN_ALIASES.put("year level", "yearLevel");
        COLUMN_ALIASES.put("yearlevel", "yearLevel");
        COLUMN_ALIASES.put("year", "yearLevel");
        COLUMN_ALIASES.put("level", "yearLevel");
        COLUMN_ALIASES.put("grade", "yearLevel");
        // role
        COLUMN_ALIASES.put("role", "role");
        COLUMN_ALIASES.put("type", "role");
        COLUMN_ALIASES.put("user type", "role");
        COLUMN_ALIASES.put("usertype", "role");
    }

    /**
     * Parse and import users from an uploaded file.
     *
     * @param file Uploaded Excel or CSV file
     * @return BatchImportResponse with created/skipped/failed counts
     */
    public BatchImportResponse importFromFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("No file uploaded.");
        }

        String filename = file.getOriginalFilename();
        if (filename == null) filename = "";
        String lower = filename.toLowerCase();

        List<RegisterUserRequest> users;

        try {
            if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
                users = parseExcel(file);
            } else if (lower.endsWith(".csv")) {
                users = parseCsv(file);
            } else {
                throw new IllegalArgumentException(
                        "Unsupported file format. Please upload .xlsx, .xls, or .csv files.");
            }
        } catch (IllegalArgumentException e) {
            throw e; // re-throw validation errors
        } catch (Exception e) {
            log.error("File parsing error: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Failed to parse file: " + e.getMessage());
        }

        if (users.isEmpty()) {
            throw new IllegalArgumentException("No valid user records found in the file.");
        }

        log.info("📄 File import: parsed {} user records from '{}'", users.size(), filename);

        BatchImportRequest request = new BatchImportRequest();
        request.setUsers(users);
        return credentialService.batchImport(request);
    }

    // ── Excel Parsing ──

    private List<RegisterUserRequest> parseExcel(MultipartFile file) throws Exception {
        try (InputStream is = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(is)) {

            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) throw new IllegalArgumentException("Excel file has no sheets.");

            // Read header row
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) throw new IllegalArgumentException("Excel file has no header row.");

            Map<Integer, String> columnMapping = mapHeaders(headerRow);

            if (!columnMapping.containsValue("institutionalId")) {
                throw new IllegalArgumentException(
                        "Required column 'Institutional ID' (or alias: Student ID, ID, ID Number) not found in header row.");
            }
            if (!columnMapping.containsValue("fullName")) {
                throw new IllegalArgumentException(
                        "Required column 'Full Name' (or alias: Name, Student Name) not found in header row.");
            }

            // Parse data rows
            List<RegisterUserRequest> users = new ArrayList<>();
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                RegisterUserRequest user = rowToUser(row, columnMapping);
                if (user != null) users.add(user);
            }

            return users;
        }
    }

    private Map<Integer, String> mapHeaders(Row headerRow) {
        Map<Integer, String> mapping = new HashMap<>();

        for (int col = 0; col < headerRow.getLastCellNum(); col++) {
            Cell cell = headerRow.getCell(col);
            if (cell == null) continue;

            String header = getCellStringValue(cell).toLowerCase().trim();
            if (header.isEmpty()) continue;

            // Find matching field
            String field = COLUMN_ALIASES.get(header);
            if (field != null && !mapping.containsValue(field)) {
                mapping.put(col, field);
            }
        }

        return mapping;
    }

    private RegisterUserRequest rowToUser(Row row, Map<Integer, String> columnMapping) {
        Map<String, String> values = new HashMap<>();

        for (Map.Entry<Integer, String> entry : columnMapping.entrySet()) {
            Cell cell = row.getCell(entry.getKey());
            String value = (cell != null) ? getCellStringValue(cell).trim() : "";
            if (!value.isEmpty()) {
                values.put(entry.getValue(), value);
            }
        }

        // Skip empty rows
        if (!values.containsKey("institutionalId") || !values.containsKey("fullName")) {
            return null;
        }

        RegisterUserRequest user = new RegisterUserRequest();
        user.setInstitutionalId(values.get("institutionalId"));
        user.setFullName(values.get("fullName"));
        user.setEmail(values.getOrDefault("email", null));
        user.setDepartment(values.getOrDefault("department", null));
        user.setYearLevel(values.getOrDefault("yearLevel", null));
        user.setRole(values.getOrDefault("role", "STUDENT")); // default to STUDENT

        return user;
    }

    /**
     * Get string value from any cell type (handles numeric IDs like 2021-00001).
     */
    private String getCellStringValue(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                // Format numbers without scientific notation
                double num = cell.getNumericCellValue();
                if (num == Math.floor(num) && !Double.isInfinite(num)) {
                    yield String.valueOf((long) num);
                }
                yield String.valueOf(num);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try {
                    yield cell.getStringCellValue();
                } catch (Exception e) {
                    yield String.valueOf(cell.getNumericCellValue());
                }
            }
            default -> "";
        };
    }

    // ── CSV Parsing ──

    private List<RegisterUserRequest> parseCsv(MultipartFile file) throws Exception {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream()))) {

            String headerLine = reader.readLine();
            if (headerLine == null || headerLine.isBlank()) {
                throw new IllegalArgumentException("CSV file is empty or has no header row.");
            }

            String[] headers = parseCsvLine(headerLine);
            Map<Integer, String> columnMapping = mapCsvHeaders(headers);

            if (!columnMapping.containsValue("institutionalId")) {
                throw new IllegalArgumentException(
                        "Required column 'Institutional ID' not found in CSV header.");
            }
            if (!columnMapping.containsValue("fullName")) {
                throw new IllegalArgumentException(
                        "Required column 'Full Name' not found in CSV header.");
            }

            List<RegisterUserRequest> users = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;

                String[] values = parseCsvLine(line);
                RegisterUserRequest user = csvRowToUser(values, columnMapping);
                if (user != null) users.add(user);
            }

            return users;
        }
    }

    private Map<Integer, String> mapCsvHeaders(String[] headers) {
        Map<Integer, String> mapping = new HashMap<>();
        for (int i = 0; i < headers.length; i++) {
            String header = headers[i].toLowerCase().trim();
            String field = COLUMN_ALIASES.get(header);
            if (field != null && !mapping.containsValue(field)) {
                mapping.put(i, field);
            }
        }
        return mapping;
    }

    private RegisterUserRequest csvRowToUser(String[] values, Map<Integer, String> columnMapping) {
        Map<String, String> fields = new HashMap<>();
        for (Map.Entry<Integer, String> entry : columnMapping.entrySet()) {
            int idx = entry.getKey();
            String val = (idx < values.length) ? values[idx].trim() : "";
            if (!val.isEmpty()) {
                fields.put(entry.getValue(), val);
            }
        }

        if (!fields.containsKey("institutionalId") || !fields.containsKey("fullName")) {
            return null;
        }

        RegisterUserRequest user = new RegisterUserRequest();
        user.setInstitutionalId(fields.get("institutionalId"));
        user.setFullName(fields.get("fullName"));
        user.setEmail(fields.getOrDefault("email", null));
        user.setDepartment(fields.getOrDefault("department", null));
        user.setYearLevel(fields.getOrDefault("yearLevel", null));
        user.setRole(fields.getOrDefault("role", "STUDENT"));

        return user;
    }

    /**
     * Simple CSV line parser that handles quoted fields with commas.
     */
    private String[] parseCsvLine(String line) {
        List<String> fields = new ArrayList<>();
        boolean inQuotes = false;
        StringBuilder current = new StringBuilder();

        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inQuotes = !inQuotes;
            } else if (c == ',' && !inQuotes) {
                fields.add(current.toString().trim());
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }
        fields.add(current.toString().trim());

        return fields.toArray(new String[0]);
    }

    // ── Template Generation ──

    /**
     * Generate a downloadable Excel template with headers and sample data.
     */
    public byte[] generateExcelTemplate() {
        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("Users");

            // Header style
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerFont.setFontHeightInPoints((short) 11);
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.LIGHT_CORNFLOWER_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // Headers
            String[] headers = {
                    "Institutional ID", "Full Name", "Email",
                    "Department", "Year Level", "Role"
            };
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 5000);
            }

            // Sample rows
            String[][] samples = {
                    {"2021-00001", "Maria Santos", "maria@school.edu", "Computer Science", "3rd Year", "STUDENT"},
                    {"2021-00002", "Juan Dela Cruz", "juan@school.edu", "Nursing", "2nd Year", "STUDENT"},
                    {"EMP-001", "Dr. Ana Reyes", "ana.reyes@school.edu", "Guidance Office", "", "PROFESSIONAL"}
            };
            for (int r = 0; r < samples.length; r++) {
                Row row = sheet.createRow(r + 1);
                for (int c = 0; c < samples[r].length; c++) {
                    row.createCell(c).setCellValue(samples[r][c]);
                }
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();

        } catch (Exception e) {
            log.error("Failed to generate template: {}", e.getMessage());
            throw new RuntimeException("Failed to generate template.", e);
        }
    }

    /**
     * Generate a CSV template string.
     */
    public String generateCsvTemplate() {
        return """
                Institutional ID,Full Name,Email,Department,Year Level,Role
                2021-00001,Maria Santos,maria@school.edu,Computer Science,3rd Year,STUDENT
                2021-00002,Juan Dela Cruz,juan@school.edu,Nursing,2nd Year,STUDENT
                EMP-001,Dr. Ana Reyes,ana.reyes@school.edu,Guidance Office,,PROFESSIONAL
                """;
    }
}
