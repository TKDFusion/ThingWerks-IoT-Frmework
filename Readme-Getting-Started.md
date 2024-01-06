### If using Home Assistant oe ESPHome:
1) Install Home Asistant (Core) and or ESP Home https://github.com/thwerks/ThingWerks-IoT-Frmework/blob/main/Readme-install-ha-esphome.md
2) Generate API Token if you're using Home Assistant 
   * ![image](https://github.com/thwerks/ThingWerks-IoT-Frmework/assets/90361336/21f55ad6-c04d-46f6-bc50-7252fa84eb8c)
  
### Prepare Files & Environment
1) Create Application directory and change directory to it
   * in this example we will use /apps/tw
2) Install NodeJS (preferably v20) and necessary NPM packages
   * npm install express
   * npm install websocket
3) If Home Assistant, ESP or Telegram are enabled:
   * npm install @2colors/esphome-native-api
   * npm install node-telegram-bot-api
   * npm install homeassistant
4) Download tw-core.js, tw-client.js and config example and place into your app directory

### Set configurations for TW-Core and first run
1) Modify the config-example.js and save as/rename to config