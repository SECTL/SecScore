import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../components"

Item {
    id: root
    
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: currentSpacing
        spacing: currentSpacing
        
        Label {
            text: "同步状态"
            font.pixelSize: currentFontSize + 6
            font.bold: true
            color: textColor
        }
        
        SyncStatusCard {
            Layout.fillWidth: true
            Layout.fillHeight: true
            
            // Pass theme properties
            surfaceColor: root.surfaceColor
            textColor: root.textColor
            textSecondaryColor: root.textSecondaryColor
            currentRadius: root.currentRadius
            currentFontSize: root.currentFontSize
        }
    }
}
