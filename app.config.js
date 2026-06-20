module.exports = {
  expo: {
    name: "Tone Generator",
    slug: "tone",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    platforms: ["android"],
    android: {
      package: "app.hivefoundry.tone",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#0f0f0f",
      },
    },
    plugins: [
      [
        "react-native-audio-api",
        {
          androidForegroundService: true,
          androidPermissions: [
            "android.permission.FOREGROUND_SERVICE",
            "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
          ],
          androidFSTypes: ["mediaPlayback"],
        },
      ],
      [
        "react-native-google-mobile-ads",
        {
          androidAppId: process.env.ADMOB_APP_ID || "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX",
        },
      ],
      "expo-build-properties",
    ],
    extra: {
      eas: {
        projectId: process.env.EAS_PROJECT_ID || "",
      },
    },
  },
};
