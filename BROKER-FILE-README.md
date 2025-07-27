# .broker File Configuration

The `.broker` file is an optional configuration file that allows you to set a default MQTT broker URL for your project.

## Purpose

- **Pre-fill broker URL**: When connecting to an MQTT broker, the connection dialog will automatically suggest the URL from this file
- **Team sharing**: Share the broker URL with team members without including credentials
- **Project-specific**: Each workspace can have its own default broker
- **Security**: Only contains the broker URL, never credentials

## File Format

The `.broker` file should contain a single line with the MQTT broker URL:

```
mqtt://localhost:1883
```

### Supported URL Formats

- **Plain MQTT**: `mqtt://broker.example.com:1883`
- **Secure MQTT**: `mqtts://broker.example.com:8883`
- **WebSocket**: `ws://broker.example.com:9001`
- **Secure WebSocket**: `wss://broker.example.com:9001`

## Example .broker Files

### Local Development
```
mqtt://localhost:1883
```

### Cloud Broker (HiveMQ)
```
mqtts://broker.hivemq.com:8883
```

### Mosquitto Test Server
```
mqtt://test.mosquitto.org:1883
```

### Eclipse IoT Broker
```
mqtts://iot.eclipse.org:8883
```

## How It Works

1. **Creating the file**: When you connect to a broker, the extension automatically saves the URL to `.broker`
2. **Reading the file**: When opening the connection dialog, the extension loads the URL from `.broker` as the default
3. **Manual creation**: You can manually create/edit the `.broker` file with any text editor

## Usage Workflow

1. **First time**: Connect to your broker through VS Code, URL is automatically saved
2. **Team members**: Clone the project, the `.broker` file provides the default URL
3. **Credentials**: Each person enters their own username/password (not saved in the file)
4. **Different brokers**: Edit the `.broker` file or connect to a different broker to update it

## Security Considerations

✅ **Safe to commit**: The `.broker` file only contains the broker URL  
✅ **No credentials**: Usernames and passwords are stored securely in VS Code's secret storage  
✅ **Team-friendly**: Safe to share in version control  
✅ **Environment-specific**: Use different URLs for dev/staging/production  

## Git Integration

The `.broker` file is safe to commit to your repository:

```bash
# Add to your repository
git add .broker
git commit -m "Add default MQTT broker configuration"
```

You may want to add environment-specific versions:
- `.broker` - Default/development
- `.broker.production` - Production environment
- `.broker.staging` - Staging environment

## Example Project Structure

```
my-iot-project/
├── .broker                 # Default broker URL
├── notebook.lotnb         # LOT notebook
├── README.md              # Project documentation
├── docker-compose.yml     # Local MQTT setup
└── .gitignore            # Excludes credentials, includes .broker
```

## Troubleshooting

**Q: The broker URL isn't being loaded**  
A: Make sure the `.broker` file is in the workspace root and contains a valid URL starting with `mqtt://`, `mqtts://`, `ws://`, or `wss://`

**Q: Can I use environment variables?**  
A: Not directly in the `.broker` file, but you can use different files for different environments

**Q: Should I commit .broker to git?**  
A: Yes! It's safe to commit since it only contains the broker URL, not credentials

**Q: Can I have multiple broker URLs?**  
A: The `.broker` file supports only one URL. For multiple brokers, manually enter different URLs when connecting

For more help, see the [Coreflux Documentation](https://docs.coreflux.org) or open an issue in the extension repository.