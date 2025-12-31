import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import SecScore 1.0

Item {
    id: root
    
    StudentRepo { id: studentRepo }
    
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: currentSpacing
        spacing: currentSpacing
        
        RowLayout {
            Layout.fillWidth: true
            Label {
                text: "积分排行榜"
                font.pixelSize: currentFontSize + 6
                font.bold: true
                color: textColor
            }
            Item { Layout.fillWidth: true }
            Button {
                text: "刷新"
                onClicked: refresh()
            }
        }
        
        ListView {
            id: listView
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: []
            spacing: 8
            
            delegate: Rectangle {
                width: listView.width
                height: 60
                color: {
                    if (index === 0) return Qt.rgba(255, 215, 0, 0.2) // Gold
                    if (index === 1) return Qt.rgba(192, 192, 192, 0.2) // Silver
                    if (index === 2) return Qt.rgba(205, 127, 50, 0.2) // Bronze
                    return surfaceColor
                }
                radius: currentRadius
                border.color: (index < 3) ? primaryColor : "transparent"
                border.width: (index < 3) ? 1 : 0
                
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 12
                    
                    Label {
                        text: "#" + (index + 1)
                        font.bold: true
                        font.pixelSize: currentFontSize + 2
                        width: 30
                        color: (index < 3) ? primaryColor : textSecondaryColor
                    }
                    
                    Label {
                        text: modelData.name
                        font.bold: index < 3
                        Layout.fillWidth: true
                        color: textColor
                    }
                    
                    Label {
                        text: modelData.score + " 分"
                        color: primaryColor
                        font.bold: true
                        font.pixelSize: currentFontSize + 2
                    }
                }
            }
        }
    }
    
    function refresh() {
        // Query sorted by score desc
        listView.model = studentRepo.query("1=1 ORDER BY score DESC")
    }
    
    Component.onCompleted: refresh()
}
